import { ArrowLeft, CalendarCheck, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface PlanningGovernanceSummary {
  activeCount?: number | null
  dashboardCloseoutOverdue?: boolean | null
  dashboardCloseoutOwnerAttentionRequired?: boolean | null
  governancePhase?: 'free_edit' | 'monthly_pending' | 'formal_execution' | 'pending_realign' | 'reordering' | 'closeout' | null
}

interface GanttViewHeaderProps {
  projectId: string
  projectName?: string | null
  planningGovernance?: PlanningGovernanceSummary | null
  onBack: () => void
  onOpenCriticalPath: () => void
  onOpenEngineeringObjects: () => void
  onRefresh?: () => void
  refreshing?: boolean
  onScrollToToday?: () => void
}

type GovernanceBannerModel = {
  testId: string
  badge: string
  className: string
  badgeClassName: string
  description: string
}

function getGovernanceBannerModel(governancePhase: PlanningGovernanceSummary['governancePhase']): GovernanceBannerModel | null {
  switch (governancePhase) {
    case 'monthly_pending':
      return {
        testId: 'gantt-governance-banner-monthly-pending',
        badge: '月计划待确认',
        className: 'border-sky-200 bg-sky-50 text-sky-900',
        badgeClassName: 'bg-sky-100 text-sky-800',
        description: '当前月度计划尚未确认，请确认后再进入正式执行。',
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
        badge: '执行编辑模式',
        className: 'border-indigo-200 bg-indigo-50 text-indigo-900',
        badgeClassName: 'bg-indigo-100 text-indigo-800',
        description: '主动编辑模式进行中，请在编辑模式结束后再进行后续业务动作。',
      }
    default:
      return null
  }
}

export function GanttGovernanceBanner({ planningGovernance }: { planningGovernance?: PlanningGovernanceSummary | null }) {
  const governanceBanner = getGovernanceBannerModel(planningGovernance?.governancePhase ?? null)
  if (!governanceBanner) return null

  return (
    <div
      data-testid={governanceBanner.testId}
      className={cn(
        'flex flex-col gap-3 rounded-2xl border px-5 py-4 text-sm md:flex-row md:items-center md:justify-between',
        governanceBanner.className,
      )}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn('inline-flex cursor-help items-center rounded-full px-2.5 py-1 text-xs font-semibold', governanceBanner.badgeClassName)}>
                {governanceBanner.badge}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{governanceBanner.description}</TooltipContent>
          </Tooltip>
          {planningGovernance?.activeCount ? (
            <span
              data-testid="gantt-governance-marker"
              className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              治理信号 {planningGovernance.activeCount}
            </span>
          ) : null}
        </div>
        <div className="text-sm font-medium">{governanceBanner.description}</div>
      </div>
    </div>
  )
}

export function GanttViewHeader(props: GanttViewHeaderProps) {
  const {
    planningGovernance,
    onBack,
    onRefresh,
    refreshing = false,
    onScrollToToday,
  } = props

  return (
    <div data-testid="task-workspace-layer-l1" className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onRefresh ? (
          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={refreshing}
            data-testid="gantt-light-refresh"
            className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs"
          >
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', refreshing && 'animate-spin')} />
            {refreshing ? '刷新中' : '刷新'}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onBack} className="h-8 rounded-lg px-2.5 text-xs">
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          返回仪表盘
        </Button>
        {onScrollToToday ? (
          <Button variant="outline" onClick={onScrollToToday} data-testid="gantt-scroll-to-today" className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs">
            <CalendarCheck className="mr-1.5 h-3.5 w-3.5" />
            今天
          </Button>
        ) : null}
      </div>
      <GanttGovernanceBanner planningGovernance={planningGovernance} />
    </div>
  )
}
