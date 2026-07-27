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
  displayProjectName,
  warningLevelClass,
  warningLevelLabel,
} from '../utils'

interface ProjectSignalRankingProps {
  projectRows: ProjectRow[]
  companySignals: {
    attentionProjectCount: number
    totalUnreadWarningCount: number
    totalDelayedTaskCount: number
  }
  onNavigate: (path: string) => void
}

function healthSignalBadgeClass(score: number | null) {
  return score === null ? 'bg-slate-100 text-slate-600' : healthBadgeClass(score)
}

function healthSignalLabel(score: number | null) {
  return score === null ? '健康信号暂不可用' : `健康信号 ${score}`
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function signalCountLabel(label: string, value: number | null) {
  return value === null ? `${label} 暂不可用` : `${label} ${value}`
}

export function ProjectSignalRanking({ projectRows, companySignals, onNavigate }: ProjectSignalRankingProps) {
  const rankedRows = projectRows
  const attentionProjectCount = companySignals.attentionProjectCount
  const totalUnreadWarnings = companySignals.totalUnreadWarningCount
  const totalDelayedTasks = companySignals.totalDelayedTaskCount

  return (
    <Card className="surface-card" data-testid="company-signal-ranking">
      <CardContent padding="md" className="space-y-4">
        <CardHead
          eyebrow="信号"
          title="关注优先级"
          action={
          <div className="flex flex-wrap justify-end gap-2 text-xs">
            <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">需关注 {attentionProjectCount}</span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">未读预警 {totalUnreadWarnings}</span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">延期信号 {totalDelayedTasks}</span>
          </div>
          }
        />
        {rankedRows.length === 0 ? (
          <EmptyState
            title="暂无项目信号数据"
            description="项目产生预警、自动延期信号或关键路径影响后会在这里排序。"
            className="min-h-[18.75rem] rounded-2xl empty-state-frame border-slate-200 bg-white py-10"
          />
        ) : (
          <ChartAccessibleWrapper
            summary="信号排行数据"
            columns={['项目', '健康信号', '预警级别', '延期信号', '活跃阻碍', '关键路径受影响', '未读预警']}
            rows={rankedRows.map((row) => {
              const summary = row.summary
              const healthScore = summary?.businessHealthScore ?? row.businessHealthScore
              const activeDelayedTasks = nullableNumber(summary?.activeDelayedTasks)
              const activeObstacles = nullableNumber(summary?.activeObstacles ?? summary?.activeObstacleCount)
              const criticalPathAffectedTasks = nullableNumber(summary?.criticalPathAffectedTasks)
              const unreadWarningCount = nullableNumber(summary?.unreadWarningCount)

              return [
                displayProjectName(row.project),
                healthScore ?? '暂不可用',
                warningLevelLabel(summary?.highestWarningLevel),
                activeDelayedTasks ?? '暂不可用',
                activeObstacles ?? '暂不可用',
                criticalPathAffectedTasks ?? '暂不可用',
                unreadWarningCount ?? '暂不可用',
              ]
            })}
          >
          <div className="h-[18.75rem] space-y-3 overflow-y-auto pr-1">
            {rankedRows.map((row) => {
              const summary = row.summary
              const healthScore = summary?.businessHealthScore ?? row.businessHealthScore
              const closeoutOverdueDays = summary?.closeoutOverdueDays ?? 0
              const warningSummary = summary?.highestWarningSummary || '项目状态需要复核，建议进入项目查看进度、节点和提醒。'
              const activeDelayedTasks = nullableNumber(summary?.activeDelayedTasks)
              const activeObstacles = nullableNumber(summary?.activeObstacles ?? summary?.activeObstacleCount)
              const criticalPathAffectedTasks = nullableNumber(summary?.criticalPathAffectedTasks)
              const unreadWarningCount = nullableNumber(summary?.unreadWarningCount)

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
                        <span className="truncate text-sm font-semibold text-slate-900">{displayProjectName(row.project)}</span>
                        <span className={`badge-base ${healthSignalBadgeClass(healthScore)}`}>
                          {healthSignalLabel(healthScore)}
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
                      {signalCountLabel('延期信号', activeDelayedTasks)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 ring-1 ring-inset ring-slate-200/60">
                      <ShieldAlert className="mr-1 inline h-3.5 w-3.5" />
                      {signalCountLabel('活跃阻碍', activeObstacles)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 ring-1 ring-inset ring-slate-200/60">
                      <Route className="mr-1 inline h-3.5 w-3.5" />
                      {signalCountLabel('关键路径受影响', criticalPathAffectedTasks)}
                    </span>
                    <span className={`rounded-full px-3 py-1 ${monthlyCloseStatusClass(summary?.monthlyCloseStatus)}`}>
                      <TriangleAlert className="mr-1 inline h-3.5 w-3.5" />
                      {summary?.monthlyCloseStatus === '已超期' && closeoutOverdueDays > 0
                        ? `关账超期 ${closeoutOverdueDays} 天`
                        : `关账 ${summary?.monthlyCloseStatus ?? '未开始'}`}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 ring-1 ring-inset ring-slate-200/60">
                      {signalCountLabel('未读预警', unreadWarningCount)}
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
