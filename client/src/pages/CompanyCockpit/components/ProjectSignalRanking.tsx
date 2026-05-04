import { Button } from '@/components/ui/button'
import { ChartAccessibleWrapper } from '@/components/ChartAccessibleWrapper'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { CardHead } from '@/components/ui/card-head'
import { BellDot, ChevronRight, Route, ShieldAlert, TimerReset, TriangleAlert } from 'lucide-react'

import type { ProjectRow } from '../types'
import {
  healthBadgeClass,
  monthlyCloseStatusClass,
  warningLevelClass,
  warningLevelLabel,
} from '../utils'

interface ProjectSignalRankingProps {
  projectRows: ProjectRow[]
  onNavigate: (path: string) => void
}

function sortBySignalPriority(left: ProjectRow, right: ProjectRow) {
  const leftSummary = left.summary
  const rightSummary = right.summary

  const leftAttention = Number(Boolean(leftSummary?.attentionRequired))
  const rightAttention = Number(Boolean(rightSummary?.attentionRequired))
  if (leftAttention !== rightAttention) return rightAttention - leftAttention

  const leftHealth = leftSummary?.healthScore ?? left.healthScore
  const rightHealth = rightSummary?.healthScore ?? right.healthScore
  if (leftHealth !== rightHealth) return leftHealth - rightHealth

  const leftUnread = leftSummary?.unreadWarningCount ?? 0
  const rightUnread = rightSummary?.unreadWarningCount ?? 0
  if (leftUnread !== rightUnread) return rightUnread - leftUnread

  const leftDelayRequests = leftSummary?.activeDelayRequests ?? 0
  const rightDelayRequests = rightSummary?.activeDelayRequests ?? 0
  if (leftDelayRequests !== rightDelayRequests) return rightDelayRequests - leftDelayRequests

  const leftCriticalImpact = leftSummary?.criticalPathAffectedTasks ?? 0
  const rightCriticalImpact = rightSummary?.criticalPathAffectedTasks ?? 0
  if (leftCriticalImpact !== rightCriticalImpact) return rightCriticalImpact - leftCriticalImpact

  return (rightSummary?.activeObstacles ?? rightSummary?.activeObstacleCount ?? 0)
    - (leftSummary?.activeObstacles ?? leftSummary?.activeObstacleCount ?? 0)
}

export function ProjectSignalRanking({ projectRows, onNavigate }: ProjectSignalRankingProps) {
  const rankedRows = [...projectRows].sort(sortBySignalPriority)
  const attentionProjectCount = rankedRows.filter((row) => row.summary?.attentionRequired).length
  const totalUnreadWarnings = rankedRows.reduce((sum, row) => sum + (row.summary?.unreadWarningCount ?? 0), 0)
  const totalDelayRequests = rankedRows.reduce((sum, row) => sum + (row.summary?.activeDelayRequests ?? 0), 0)

  return (
    <Card className="surface-card" data-testid="company-signal-ranking">
      <CardContent padding="md" className="space-y-4">
        <CardHead
          eyebrow="SIGNALS"
          title="项目信号排行"
          action={
          <div className="flex flex-wrap justify-end gap-2 text-xs">
            <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">需关注 {attentionProjectCount}</span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">未读预警 {totalUnreadWarnings}</span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">延期审批 {totalDelayRequests}</span>
          </div>
          }
        />
        {rankedRows.length === 0 ? (
          <EmptyState
            title="暂无项目信号数据"
            description="项目产生预警、延期审批或关键路径影响后会在这里排序。"
            className="min-h-[18.75rem] rounded-2xl empty-state-frame border-slate-200 bg-white py-10"
          />
        ) : (
          <ChartAccessibleWrapper
            summary="信号排行数据"
            columns={['项目', '健康度', '预警级别', '延期审批', '活跃阻碍', '关键路径受影响', '未读预警']}
            rows={rankedRows.map((row) => {
              const summary = row.summary
              return [
                row.project.name,
                summary?.healthScore ?? row.healthScore,
                warningLevelLabel(summary?.highestWarningLevel),
                summary?.activeDelayRequests ?? 0,
                summary?.activeObstacles ?? summary?.activeObstacleCount ?? 0,
                summary?.criticalPathAffectedTasks ?? 0,
                summary?.unreadWarningCount ?? 0,
              ]
            })}
          >
          <div className="h-[18.75rem] space-y-3 overflow-y-auto pr-1">
            {rankedRows.map((row) => {
              const summary = row.summary
              const closeoutOverdueDays = summary?.closeoutOverdueDays ?? 0
              const warningSummary = summary?.highestWarningSummary || '当前暂无高优先级预警'

              return (
                <div
                  key={row.project.id}
                  role="button"
                  tabIndex={0}
                  data-testid="company-signal-row"
                  onClick={() => onNavigate(`/projects/${row.project.id}/dashboard`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onNavigate(`/projects/${row.project.id}/dashboard`)
                    }
                  }}
                  className={`flex w-full flex-col gap-3 rounded-2xl border px-4 py-4 text-left transition-colors ${
                    summary?.attentionRequired
                      ? 'border-red-100 bg-red-50/40 hover:bg-red-50'
                      : 'border-white bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">{row.project.name}</span>
                        <span className={`badge-base ${healthBadgeClass(summary?.healthScore ?? row.healthScore)}`}>
                          健康 {summary?.healthScore ?? row.healthScore}
                        </span>
                        <span className={`badge-base ${warningLevelClass(summary?.highestWarningLevel)}`}>
                          {warningLevelLabel(summary?.highestWarningLevel)}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{warningSummary}</p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid="company-signal-reminder-button"
                        className="h-8 rounded-xl border-slate-200 bg-white px-3 text-xs"
                        onClick={(event) => {
                          event.stopPropagation()
                          onNavigate(`/notifications?scope=current-project&projectId=${encodeURIComponent(row.project.id)}`)
                        }}
                      >
                        <BellDot className="mr-1 h-3.5 w-3.5" />
                        提醒中心
                      </Button>
                      <ChevronRight className="h-4 w-4 text-slate-500" />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 ring-1 ring-inset ring-slate-200/60">
                      <TimerReset className="mr-1 inline h-3.5 w-3.5" />
                      延期审批 {summary?.activeDelayRequests ?? 0}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 ring-1 ring-inset ring-slate-200/60">
                      <ShieldAlert className="mr-1 inline h-3.5 w-3.5" />
                      活跃阻碍 {summary?.activeObstacles ?? summary?.activeObstacleCount ?? 0}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 ring-1 ring-inset ring-slate-200/60">
                      <Route className="mr-1 inline h-3.5 w-3.5" />
                      关键路径受影响 {summary?.criticalPathAffectedTasks ?? 0}
                    </span>
                    <span className={`rounded-full px-3 py-1 ${monthlyCloseStatusClass(summary?.monthlyCloseStatus)}`}>
                      <TriangleAlert className="mr-1 inline h-3.5 w-3.5" />
                      {summary?.monthlyCloseStatus === '已超期' && closeoutOverdueDays > 0
                        ? `关账超期 ${closeoutOverdueDays} 天`
                        : `关账 ${summary?.monthlyCloseStatus ?? '未开始'}`}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 ring-1 ring-inset ring-slate-200/60">
                      未读预警 {summary?.unreadWarningCount ?? 0}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          </ChartAccessibleWrapper>
        )}
      </CardContent>
    </Card>
  )
}
